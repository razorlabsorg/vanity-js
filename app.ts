import { Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { createHash } from 'crypto';
import { program } from 'commander';
import * as os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

interface CliArgs {
  prefix?: string;
  suffix?: string;
  multisig: boolean;
  count: number;
  threads: number;
}

const SEQUENCE_NUMBER_MULTISIG = 0n;

// Parse command line arguments
function parseArgs(): CliArgs {
  return program
    .option('-p, --prefix <string>', 'Address prefix to match (no leading 0x)')
    .option('-s, --suffix <string>', 'Address suffix to match')
    .option('-m, --multisig', 'Search for multisig addresses', false)
    .option('-c, --count <number>', 'Number of addresses to generate', '1')
    .option('-t, --threads <number>', 'Number of threads to use', String(os.cpus().length))
    .parse()
    .opts();
}

// Helper to convert bytes to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generate authentication key bytes
function authKeyBytesVec(privateKey: Ed25519PrivateKey): Uint8Array {
  const publicKey = privateKey.publicKey().toUint8Array();
  // Append scheme identifier (0x00) to public key before hashing
  const withScheme = new Uint8Array([...publicKey, 0x00]);
  return createHash('sha3-256').update(withScheme).digest();
}

// Create multisig account address
function createMultisigAccountAddress(creator: Uint8Array, creatorNonce: bigint): Uint8Array {
  const seed = Buffer.from('aptos_framework::multisig_account');
  const nonceBytes = Buffer.from(creatorNonce.toString(16), 'hex');
  const combined = Buffer.concat([creator, seed, nonceBytes, Buffer.from([255])]);
  return createHash('sha3-256').update(combined).digest();
}

// Worker thread function
if (!isMainThread) {
  const { prefix, suffix, multisig } = workerData;
  
  const generateKey = async () => {
    while (true) {
      const privateKey = Ed25519PrivateKey.generate();
      const accountAddressBytes = authKeyBytesVec(privateKey);
      const searchBytes = multisig 
        ? createMultisigAccountAddress(accountAddressBytes, SEQUENCE_NUMBER_MULTISIG)
        : accountAddressBytes;

      const address = bytesToHex(searchBytes);
      
      // Check prefix/suffix match
      if (prefix && !address.startsWith(prefix)) continue;
      if (suffix && !address.endsWith(suffix)) continue;

      parentPort?.postMessage({
        address,
        privateKey: bytesToHex(privateKey.toUint8Array()),
        multisigAddress: multisig ? address : undefined
      });
    }
  };

  generateKey().catch(console.error);
}

// Main thread
async function main() {
  const args = parseArgs();
  const startTime = Date.now();
  let foundCount = 0;
  let totalGenerated = 0;

  // Spawn worker threads
  const workers = Array.from({ length: args.threads }, () => 
    new Worker(__filename, {
      workerData: {
        prefix: args.prefix,
        suffix: args.suffix,
        multisig: args.multisig
      }
    })
  );

  // Handle results from workers
  workers.forEach(worker => {
    worker.on('message', ({ address, privateKey, multisigAddress }) => {
      totalGenerated++;
      foundCount++;
      
      if (multisigAddress) {
        console.log(`Multisig account address: 0x${multisigAddress}`);
        console.log(`Standard account address: 0x${address}`);
      } else {
        console.log(`Standard account address: 0x${address}`);
      }
      console.log(`Private key:              0x${privateKey}\n`);

      if (foundCount >= args.count) {
        console.log(`Elapsed time: ${(Date.now() - startTime) / 1000}s`);
        console.log(`Total addresses generated: ${totalGenerated}`);
        process.exit(0);
      }
    });
  });
}

if (isMainThread) {
  main().catch(console.error);
}
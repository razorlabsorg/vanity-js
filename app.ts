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

// Benchmark the system's performance
async function benchmarkPerformance(iterations: number = 1000): Promise<number> {
  const startTime = Date.now();
  let count = 0;
  
  while (count < iterations) {
    const privateKey = Ed25519PrivateKey.generate();
    authKeyBytesVec(privateKey);
    count++;
  }
  
  const elapsed = (Date.now() - startTime) / 1000; // Convert to seconds
  const genPerSecond = Math.floor(iterations / elapsed); // Returns generations per second
  return genPerSecond;
}

// Format time duration into human readable string
function formatDuration(seconds: number): string {
  if (seconds < 0.1) return `~${(seconds * 1000).toFixed(0)} milliseconds`;
  if (seconds < 60) return `~${Math.ceil(seconds)} seconds`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)} minutes`;
  if (seconds < 86400) return `~${(seconds / 3600).toFixed(1)} hours`;
  return `~${(seconds / 86400).toFixed(1)} days`;
}

// Calculate estimated time based on prefix/suffix length
async function calculateEstimate(prefix?: string, suffix?: string, threadCount: number = 1): Promise<string> {
  if (!prefix && !suffix) return 'Should be instant';
  
  // Calculate probability based on hex character matches needed
  const matchNeeded = (prefix?.length || 0) + (suffix?.length || 0);
  const probabilityPerTry = 1 / (16 ** matchNeeded); // 16 possible hex chars
  
  // Estimate attempts needed (95% confidence)
  const attemptsNeeded = Math.ceil(-Math.log(0.05) / probabilityPerTry);
  
  // Benchmark actual system performance
  const genPerSecondSingleThread = await benchmarkPerformance();
  const genPerSecondTotal = genPerSecondSingleThread * threadCount;
  
  const seconds = attemptsNeeded / genPerSecondTotal;
  
  return formatDuration(seconds);
}

// Worker thread function
if (!isMainThread) {
  const { prefix, suffix, multisig } = workerData;
  let localGenCount = 0;
  
  const generateKey = async () => {
    while (true) {
      localGenCount++;
      // Send generation count to main thread every 1000 attempts
      if (localGenCount % 1000 === 0) {
        parentPort?.postMessage({ type: 'progress', count: 1000 });
      }

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
        type: 'result',
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
  let lastUpdateTime = Date.now();

  // Show estimate before starting
  console.log(`Benchmarking system performance...`);
  console.log(`Estimated time: ${await calculateEstimate(args.prefix, args.suffix, args.threads)}`);
  console.log('Generating addresses...\n');

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
    worker.on('message', (message) => {
      if (message.type === 'progress') {
        totalGenerated += message.count;
        const currentTime = Date.now();
        // Update display every second
        if (currentTime - lastUpdateTime >= 1000) {
          const elapsedSeconds = (currentTime - startTime) / 1000;
          const genPerSecond = Math.floor(totalGenerated / elapsedSeconds);
          process.stdout.write(`\rGenerating... ${genPerSecond.toLocaleString()} addresses per second`);
          lastUpdateTime = currentTime;
        }
      } else if (message.type === 'result') {
        process.stdout.write('\n'); // Clear the progress line
        foundCount++;
        
        if (message.multisigAddress) {
          console.log(`Multisig account address: 0x${message.multisigAddress}`);
          console.log(`Standard account address: 0x${message.address}`);
        } else {
          console.log(`Standard account address: 0x${message.address}`);
        }
        console.log(`Private key:              0x${message.privateKey}\n`);

        if (foundCount >= args.count) {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          const finalGenPerSecond = Math.floor(totalGenerated / elapsedSeconds);
          console.log(`Final generation rate: ${finalGenPerSecond.toLocaleString()} addresses/second`);
          console.log(`Elapsed time: ${elapsedSeconds}s`);
          console.log(`Total addresses generated: ${totalGenerated.toLocaleString()}`);
          process.exit(0);
        }
      }
    });
  });
}

if (isMainThread) {
  main().catch(console.error);
}
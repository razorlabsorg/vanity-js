# Vanity Address Generator

This is a simple CLI tool to generate vanity addresses for the Aptos/Movement blockchain.

It supports generating both single standard accounts and MultiSig accounts.

## Usage
Install dependencies

```bash
pnpm i
```

Build the project

```bash
pnpm build
```

Run the project

```bash
pnpm start --prefix <prefix>
```

You can also use the `--multisig` flag to generate MultiSig accounts.

```bash
pnpm start --prefix <prefix> --multisig
```

You can also specify other options like `--suffix`, `--count`, and `--threads`.

```bash
pnpm start --prefix <prefix> --suffix <suffix> --count <count> --threads <threads>
```

# Security Note

This tool does not need internet access to generate addresses. It uses the Aptos/Movement SDK to generate the private keys locally using your machine's CPU. If you intend to use it to generate an address/addresses for live use, please ensure you turn off your internet connection before running it.

# Performance Note

By default, the tool will use all the cores on your machine to generate addresses as fast as possible. You can change this by using the `--threads` flag.

```bash
pnpm start --prefix <prefix> --threads <threads>
```

This tool might be less performant than other counterparts written in Rust or C, but it's still fast enough to generate addresses at good rate. 

Also, bear in mind that for every character added to a prefix/suffix, the difficulty of generating an address increases exponentially(approx. 16x per character).










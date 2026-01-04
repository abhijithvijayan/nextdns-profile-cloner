# NextDNS Manager Web

A Next.js web application that provides a graphical interface for managing NextDNS profiles.

**Live Demo:** [apps.nextdns.abhijithvijayan.in](https://apps.nextdns.abhijithvijayan.in)

## Features

- **Manage Domain** - Add, remove, enable, or disable domains from allowlist/denylist with a visual interface
- **Sync Lists** - Sync domains across profiles with real-time progress tracking and dry-run preview
- **Diff Profiles** - Compare profiles side-by-side with color-coded differences
- **Copy Profile** - Clone profiles between accounts with visual feedback

## Privacy

Your API key is stored locally in your browser's localStorage. It is never sent to any server other than the official NextDNS API.

## Development

### Prerequisites

- Node.js 20 or later
- npm

### Local Development

```sh
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```sh
npm run build
```

## Deployment

### Cloudflare Pages (Recommended)

The app is configured for deployment on Cloudflare Pages using Wrangler.

```sh
# Preview locally with Wrangler
npm run cf:dev

# Deploy to Cloudflare
npm run deploy
```

### Configuration

The `wrangler.toml` file contains the Cloudflare deployment configuration:

```toml
name = "nextdns-manager"
main = "worker/index.ts"

[build]
command = "npx next telemetry disable && npm run build"

[assets]
directory = "./out"
```

### Other Platforms

The app exports as static HTML and can be deployed to any static hosting provider:

- Vercel
- Netlify
- GitHub Pages
- Any static file server

After running `npm run build`, the static files are generated in the `out/` directory.

## Tech Stack

- [Next.js 16](https://nextjs.org/) - React framework
- [React 19](https://react.dev/) - UI library
- [Sass](https://sass-lang.com/) - CSS preprocessor
- [Cloudflare Pages](https://pages.cloudflare.com/) - Hosting

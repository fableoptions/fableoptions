# Pipo gradient integration in Fable

The **deployed** Fable homepage is currently a lightweight static HTML/CSS/JavaScript app rooted at `/web`, served by the existing Railway web-preview service. It is **not** a React, Tailwind or shadcn/ui application. The effective styles are `web/style.css` and `web/orbit.css`. TypeScript is already used by the backend in `src/`, not by the browser UI.

## Active homepage implementation (no new dependencies)

`web/index.html` puts a `.pipo-gradient` directly inside `.orbit-stage`, before the orbit's canvas and token buttons. `web/orbit.css` reproduces the supplied Pipo peach/blue/cream multi-radial background, its soften-blur layer, and a separate SVG noise pass. It uses `pointer-events:none` and explicit stacking, so it does not interfere with selecting coins or previewing fake-USDC options. No third-party image assets are used by this gradient.

## Portable React version (not currently deployed)

`components/ui/pipo.tsx` contains the portable user-supplied `GradientBackground` function. `components/ui/pipo-demo.tsx` contains the example using Tailwind layout classes. Keeping reusable UI components in `components/ui` follows shadcn conventions and prevents design primitives from being mixed into feature code.

**Do not install React/shadcn into the existing production root solely for this background.** If Fable later migrates to a React frontend, create it in a separate app directory and preserve the backend and Railway services:

1. Create a React + TypeScript application (for example `npm create vite@latest web-react -- --template react-ts`).
2. Install and initialize Tailwind CSS for that app, following the version-appropriate Tailwind framework instructions.
3. Initialize shadcn/ui with `npx shadcn@latest init`, selecting a components alias of `@/components`; create `components/ui` if absent.
4. Copy `pipo.tsx` into that app's `components/ui/`, configure the TypeScript `@/*` path alias, and place `<GradientBackground className="absolute inset-0" />` inside a `relative overflow-hidden` orbit-stage wrapper. Use a containing element with explicit height and put the globe and interactive nodes in a higher stacking layer.
5. Only move the Railway web-preview source once the new application has passed testing. No new paid infrastructure is needed.

The component uses no external icon package, image assets, React context or state providers. The static version works responsively with the existing orbit breakpoints.

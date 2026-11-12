# The web app, built from source and served by nginx:
#   docker build -t wizardchat .
#   docker run -p 8080:80 wizardchat
FROM rust:1-bookworm AS builder

# Node next to the Rust toolchain (the build runs both)
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

ARG WASM_PACK=0.15.0
RUN arch="$(uname -m)" \
 && curl -sSfL "https://github.com/rustwasm/wasm-pack/releases/download/v${WASM_PACK}/wasm-pack-v${WASM_PACK}-${arch}-unknown-linux-musl.tar.gz" \
  | tar -xz --strip-components=1 -C /usr/local/bin "wasm-pack-v${WASM_PACK}-${arch}-unknown-linux-musl/wasm-pack"

WORKDIR /app
COPY rust-toolchain.toml ./
RUN rustup toolchain install

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/i18n/package.json packages/i18n/
COPY packages/emoji/package.json packages/emoji/
COPY packages/icons/package.json packages/icons/
COPY packages/sounds/package.json packages/sounds/
RUN npm ci --ignore-scripts

COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    npm run build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/ /etc/nginx/snippets/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=ca_bundle sh -c 'if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi; npm ci --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000'
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm","run","dev"]

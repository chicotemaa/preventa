FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

ENV NODE_ENV=production
ENV HEADLESS=true

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY worker/package.json ./worker/package.json
COPY worker/tsconfig.json ./worker/tsconfig.json
COPY worker/src ./worker/src
COPY worker/data ./worker/data

RUN apt-get update \
  && apt-get install -y --no-install-recommends imagemagick poppler-utils tesseract-ocr tesseract-ocr-spa \
  && rm -rf /var/lib/apt/lists/*

RUN npm ci --workspace worker --include=dev
RUN npm run build --workspace worker
RUN npm prune --omit=dev --workspace worker

WORKDIR /app/worker

EXPOSE 4000

CMD ["npm", "run", "start"]

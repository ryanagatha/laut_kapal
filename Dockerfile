FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_MAP_STYLE_URL
ENV NEXT_PUBLIC_MAP_STYLE_URL=${NEXT_PUBLIC_MAP_STYLE_URL}
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]

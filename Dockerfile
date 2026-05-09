FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json ./
COPY server.js ./
COPY src ./src

EXPOSE 3000

CMD ["node", "server.js"]

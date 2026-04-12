FROM node:18-alpine

RUN apk add --no-cache sqlite

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY . .

EXPOSE 4090

CMD ["node", "server.js"]

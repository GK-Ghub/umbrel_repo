FROM node:18-alpine

# Install iputils for ping (needed on alpine)
RUN apk add --no-cache iputils

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY . .

EXPOSE 4080

CMD ["node", "server.js"]

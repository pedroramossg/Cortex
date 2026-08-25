FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY api/ ./api/

EXPOSE 3000
CMD ["node", "api/server.js"]
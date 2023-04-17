FROM node:19-alpine3.16
RUN npm install -g pnpm
RUN mkdir -p /usr/app
WORKDIR /usr/app
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY app.ts ./
RUN pnpm install 
EXPOSE 3000
CMD pnpm start
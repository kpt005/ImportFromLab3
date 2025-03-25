FROM node:23-alpine
RUN mkdir -p /usr/src/app/Front_end
WORKDIR /usr/src/app/Front_end
COPY . /usr/src/app/Front_end/
RUN npm install
EXPOSE 3001
CMD ["node", "server.js"]
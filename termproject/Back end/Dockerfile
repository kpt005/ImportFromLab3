FROM node:23-alpine
RUN mkdir -p /usr/src/app/Back_end
WORKDIR /usr/src/app/Back_end
COPY . /usr/src/app/Back_end/
RUN npm install
EXPOSE 3000
CMD ["node", "app.js"]
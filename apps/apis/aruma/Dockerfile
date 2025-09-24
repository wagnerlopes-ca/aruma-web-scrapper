FROM node:20-alpine As development

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx nx run aruma:build

FROM node:20-alpine
ENV NODE_ENV production

COPY --from=development /usr/src/app/dist/apps/apis/aruma ./dist
COPY package*.json ./

RUN npm install --omit=dev

USER node
# Start the server using the production build
CMD [ "node", "dist/main.js" ]
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Create the urls.cfg file if needed
RUN touch urls.cfg

# Expose the port the app runs on
EXPOSE 3030

# Command to run the application
CMD ["node", "server.js"] 
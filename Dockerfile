FROM node:18
# Set up a non-root user (required by Hugging Face)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

# Copy your GitHub files into the container
COPY --chown=user . $HOME/app

# Install dependencies and start
RUN npm install
CMD ["node", "server.js"]
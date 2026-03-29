FROM gitlab/gitlab-runner:latest

# Install Node.js (LTS)
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy UI
WORKDIR /app
COPY ui/package.json ./
RUN npm install --production
COPY ui/ ./

# Entrypoint: create config if missing, start UI + runner in parallel
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9252
ENTRYPOINT ["/entrypoint.sh"]

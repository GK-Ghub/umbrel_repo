#!/usr/bin/env bash
set -e

CONFIG=/etc/gitlab-runner/config.toml

# Bootstrap empty config so runner doesn't error-loop
mkdir -p /etc/gitlab-runner
if [ ! -f "$CONFIG" ]; then
  printf 'concurrent = 4\ncheck_interval = 10\n' > "$CONFIG"
  echo ">>> Created empty config.toml — use the web UI to register."
fi

# Start the config/registration web UI in the background
echo ">>> Starting configuration UI on port 9252..."
node /app/server.js &

# Start gitlab-runner in the foreground (keeps container alive)
echo ">>> Starting GitLab Runner..."
exec gitlab-runner run \
  --user=gitlab-runner \
  --working-directory=/home/gitlab-runner

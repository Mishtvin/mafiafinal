module.exports = {
  apps: [{
    name: "mafia-live",
    script: "dist/index.js",
    env: {
      NODE_ENV: "production",
      LIVEKIT_API_KEY: "API5CKkZVpy2vUu",
      LIVEKIT_API_SECRET: "vM3YNq1c2xqzFfrpbktHBx2vD3ZK1SSfazSwY53kix5"
    }
  }]
}

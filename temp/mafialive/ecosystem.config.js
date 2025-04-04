module.exports = {
  apps: [
    {
      name: "livekit-meet-prod",
      script: "npm",
      args: "run start -- -p 3001",
      cwd: "/var/www/mish.leb1gamafia.com/meet",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
        LIVEKIT_API_KEY: "422f1dcc55db4f7f0e4d659928474ce0",
        LIVEKIT_API_SECRET: "2251b7640caa1202c0861edef8809f5f"
      }
    }
  ]
};


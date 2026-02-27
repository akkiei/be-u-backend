<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).


# Be-U Social Media API (NestJS + Fastify)

A high-performance, low-memory backend for a beauty and food product social platform. This API is aggressively optimized to run on an Oracle Cloud Infrastructure (OCI) Always Free tier (1GB RAM) using Domain-Driven Design (DDD), a connection pooler, and cloud-native storage solutions.

## 🚀 Tech Stack

* **Framework:** [NestJS](https://nestjs.com/) (Switched from Express to **Fastify** for lower memory footprint and faster request handling)

* **Compiler:** [SWC](https://swc.rs/) (Rust-based, compiles 20x faster)

* **Database ORM:** [Drizzle ORM](https://orm.drizzle.team/)

* **Database:** PostgreSQL (External connection via Pooler to save server RAM)

* **Image Storage:** Cloudinary / Oracle Object Storage (Off-server storage)

* **AI Memory (Vector DB):** Qdrant Cloud or Supabase `pgvector` (For 3-tiered LLM contextual memory)

## 🏗️ Project Architecture (Domain-Driven Design)

To keep the application modular and scalable, features are isolated into specific domains:

```text
src/
├── app.module.ts
├── core/                  # Global app config, Exception Filters, and Logger
├── database/              # Drizzle ORM schema, migrations, and external Postgres connection
│   ├── database.module.ts
│   └── schema.ts          # Centralized definition of Users, Posts, etc.
├── main.ts                # Fastify bootstrap entry point (Binds to 0.0.0.0)
└── modules/               
    ├── ai-memory/         # LLM context retrieval and vector DB integration
    ├── auth/              # JWT strategies, login/signup
    ├── media/             # Off-server image upload services
    ├── posts/             # Beauty & food product feeds
    └── users/             # User profiles and follower graph



    ☁️ Infrastructure Setup (OCI 1GB RAM Survival Guide)

If deploying to a fresh Oracle VM.Standard.E2.1.Micro instance, the following OS-level configurations are mandatory to prevent crashes.

1. Enable the 4GB Swap File

NestJS and NPM require more than 1GB of RAM to compile and install dependencies. The swap file acts as emergency overflow memory.

sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab


2. Bypass the "Oracle iptables Trap"

Oracle’s default Ubuntu image has a REJECT all rule at position 5 that blocks HTTP/HTTPS and custom ports. You must insert your application ports above this rule.

sudo apt update && sudo apt install iptables-persistent netfilter-persistent -y
sudo iptables -I INPUT 5 -p tcp --dport 3000 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save


3. Python 3.11 Virtual Environment (For AI/Utility Scripts)

sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt install python3.11 python3.11-venv python3.11-dev -y
python3.11 -m venv ai_env
source ai_env/bin/activate


💻 Local Development & Setup

1. Install Dependencies

npm install


2. Environment Variables

Create a .env file in the root directory. Note: Always use the "Pooled" connection string (e.g., port 6543) for your external PostgreSQL database.

DATABASE_URL=postgresql://user:password@pooler-endpoint.provider.com:6543/dbname?sslmode=require
PORT=3000


3. Database Migrations (Drizzle ORM)

Whenever you update src/database/schema.ts (e.g., adding new fields to the beauty or food post models), run:

# Push schema directly to the database (Fast prototyping)
npx drizzle-kit push

# Generate migration files (Production safe)
npx drizzle-kit generate


4. Run the Server

# Development mode (Uses SWC compiler)
npm run start:dev


🚀 Production Deployment (PM2 Memory Guard)

Do not run standard clustering in production on the 1GB server. We use PM2 with a strict max_memory_restart limit to prevent Linux Out-Of-Memory (OOM) kills.

Ensure ecosystem.config.js is present in the root directory:

module.exports = {
  apps: [{
    name: "social-api",
    script: "dist/main.js",
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "600M",
    env: { NODE_ENV: "production" }
  }]
}


Build and start:

npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup



require("dotenv").config();
import assert from "assert";
import { tables } from "@uma/sdk";
import { ethers } from "ethers";
import * as Services from "../services";
import Express from "../services/express";
import Actions from "../services/actions";
import { ProcessEnv, Libs } from "..";

async function start(env: ProcessEnv) {
  assert(env.CUSTOM_NODE_URL, "requires CUSTOM_NODE_URL");
  assert(env.EXPRESS_PORT, "requires EXPRESS_PORT");
  const provider = new ethers.providers.WebSocketProvider(env.CUSTOM_NODE_URL);

  // state shared between services
  const libs: Libs = {
    provider,
    blocks: tables.blocks.JsMap(),
    emps:{
      active:tables.emps.JsMap('Active Emp'),
      expired:tables.emps.JsMap('Expired Emp'),
    },
    lastBlock: 0,
    registeredEmps: new Set<string>(),
  };
  // services for ingesting data
  const services = {
    blocks: Services.Blocks({}, libs),
    emps: Services.Emps({}, libs),
    registry: Services.Registry({}, libs),
  };

  // services consuming data
  const actions = Actions({}, libs);

  // expose calls through express
  await Express({ port: Number(env.EXPRESS_PORT) }, actions);

  // warm caches
  await services.registry();
  await services.emps();

  // main update loop, update every block
  provider.on("block", (blockNumber: number) => {
    services.blocks.handleNewBlock(blockNumber).catch(console.error);
    services.emps(libs.lastBlock, blockNumber).catch(console.error);
    libs.lastBlock = blockNumber;
  });
}

start(process.env)
  .then(() => console.log("Running"))
  .catch(console.error);

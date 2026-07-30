// Manual Teleduce sync runner (mirrors the cron route). Mock mode unless live
// TELEDUCE_API_* creds are set in .env.  Usage: npm run teleduce:pull
import { prisma } from "../src/lib/prisma";
import { getTeleduceClient } from "../src/lib/teleduce/client";
import { runTeleducePull } from "../src/lib/teleduce/sync";
import { processPendingWritebacks } from "../src/lib/teleduce/writeback";

async function main() {
  const client = getTeleduceClient();
  console.log(`Teleduce client mode: ${client.mode}`);

  const pull = await runTeleducePull({ client });
  console.log("PULL:", pull);

  const writeback = await processPendingWritebacks({ client });
  console.log("WRITEBACK:", writeback);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

// Programmatically add an email identity to SES (sends a verification email).
// Usage: npx tsx src/scripts/add-recipient.ts someone@example.com
import "dotenv/config";
import { SESv2Client, CreateEmailIdentityCommand } from "@aws-sdk/client-sesv2";

const client = new SESv2Client({ region: process.env.AWS_REGION });
const email = process.argv[2];

if (!email) {
  console.error("Please pass an email. e.g. npx tsx src/scripts/add-recipient.ts x@y.com");
  process.exit(1);
}

const res = await client.send(new CreateEmailIdentityCommand({ EmailIdentity: email }));
console.log(`Verification email sent to ${email} (status ${res.$metadata.httpStatusCode}).`);
console.log("Now open that inbox and click the AWS verification link.");

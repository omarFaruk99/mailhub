// Sends email through Amazon SES (AWS SDK v3, SES v2 API).
// Credentials are read automatically from env:
//   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const client = new SESv2Client({ region: process.env.AWS_REGION });

// Tags this send with an SES configuration set, which is what routes bounce and
// complaint events to our SNS topic and on to /webhooks/ses. Without it AWS can
// look fully configured and still deliver no events — the set has to be named on
// the send itself. Unset (local dev, no SNS) simply sends without one.
//
// Read per call, not once at module load: `.env` is loaded before this file in
// production but a test or script may set it later, and an empty string must
// behave as "not set" rather than being sent to AWS as a blank name.
function configurationSet(): string | undefined {
  const name = process.env.SES_CONFIGURATION_SET?.trim();
  return name ? name : undefined;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: { Name: string; Value: string }[];
}) {
  const from = process.env.SES_FROM;
  if (!from) throw new Error("SES_FROM is not set in .env");

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [opts.to] },
    ConfigurationSetName: configurationSet(),
    Content: {
      Simple: {
        Subject: { Data: opts.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: opts.html, Charset: "UTF-8" },
          ...(opts.text ? { Text: { Data: opts.text, Charset: "UTF-8" } } : {}),
        },
        // Extra headers (e.g. List-Unsubscribe for one-click unsubscribe).
        ...(opts.headers ? { Headers: opts.headers } : {}),
      },
    },
  });

  const res = await client.send(command);
  return res.MessageId;
}

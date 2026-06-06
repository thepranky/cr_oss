export type MailContext = 'compose' | 'read' | 'unavailable';

/** Best-effort sync check: compose-only APIs exist only in the compose form. */
export function getMailContext(): MailContext {
  const item = Office.context?.mailbox?.item;
  if (!item || item.itemType !== Office.MailboxEnums.ItemType.Message) {
    return 'unavailable';
  }

  if ('getComposeTypeAsync' in item) {
    return 'compose';
  }

  return 'read';
}

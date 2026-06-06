export type BodyCoercionType = 'html' | 'text';

function toOfficeCoercion(coercionType: BodyCoercionType): Office.CoercionType {
  return coercionType === 'html' ? Office.CoercionType.Html : Office.CoercionType.Text;
}

function getComposeBody(): Office.Body {
  const item = Office.context.mailbox.item;
  if (!item) {
    throw new Error('No mail item in context.');
  }
  return item.body;
}

function asyncBodyError(action: 'read' | 'write', result: Office.AsyncResult<unknown>): Error {
  const detail = result.error?.message;
  const prefix = action === 'read' ? 'Failed to read message body' : 'Failed to write message body';
  return new Error(detail ? `${prefix}: ${detail}` : prefix);
}

export function getBodyCoerced(coercionType: BodyCoercionType): Promise<string> {
  return new Promise((resolve, reject) => {
    getComposeBody().getAsync(toOfficeCoercion(coercionType), (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value);
        return;
      }
      reject(asyncBodyError('read', result));
    });
  });
}

export function setBody(content: string, coercionType: BodyCoercionType): Promise<void> {
  return new Promise((resolve, reject) => {
    getComposeBody().setAsync(
      content,
      { coercionType: toOfficeCoercion(coercionType) },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve();
          return;
        }
        reject(asyncBodyError('write', result));
      },
    );
  });
}

export function getBodyHtml(): Promise<string> {
  return getBodyCoerced('html');
}

export function getBodyText(): Promise<string> {
  return getBodyCoerced('text');
}

export function setBodyHtml(content: string): Promise<void> {
  return setBody(content, 'html');
}

import type { BodyCoercionType } from './body';

function toOfficeCoercion(coercionType: BodyCoercionType): Office.CoercionType {
  return coercionType === 'html' ? Office.CoercionType.Html : Office.CoercionType.Text;
}

function getComposeItem(): Office.MessageCompose {
  const item = Office.context.mailbox.item;
  if (!item) {
    throw new Error('No mail item in context.');
  }
  return item;
}

function getSelectedCoerced(coercionType: BodyCoercionType): Promise<string> {
  return new Promise((resolve, reject) => {
    const item = getComposeItem();
    item.getSelectedDataAsync(toOfficeCoercion(coercionType), (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value?.data ?? '');
        return;
      }
      const detail = result.error?.message;
      reject(new Error(detail ? `Failed to read selection: ${detail}` : 'Failed to read selection.'));
    });
  });
}

export function getSelectedText(): Promise<string> {
  return getSelectedCoerced('text');
}

export function getSelectedHtml(): Promise<string> {
  return getSelectedCoerced('html');
}

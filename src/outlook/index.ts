export {
  getBodyCoerced,
  getBodyHtml,
  getBodyText,
  setBody,
  setBodyHtml,
  type BodyCoercionType,
} from './body';
export {
  captureComposeSelectionAnchors,
  captureSelectionAnchors,
  extractRegionHtml,
  findAllSelectionRegions,
  locateRegionInPlainText,
  regionMatchesAnchors,
  replaceRegionInHtml,
  scoreSelectionAgainstBaseline,
  type CaptureSelectionOptions,
  type LocatedRegion,
  type ReplaceRegionOptions,
} from './bodyRegion';
export { getMailContext, type MailContext } from './context';
export { officeReady, type HostInfo } from './officeReady';
export {
  getSelectedHtml,
  getSelectedText,
  hasComposeSelection,
  setSelectedHtml,
} from './selection';
export { resolveSelectionHtml } from './selectionHtml';

/** A bounded batch protects the web container from one request rendering thousands
 * of image-heavy PDFs. Each individual portfolio can still contain any number of
 * listing images. */
export const MAX_BULK_PORTFOLIOS = 50;

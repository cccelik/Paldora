export const characterCount = (text: string, maximum: number): string =>
  `${text.length.toLocaleString('en')} / ${maximum.toLocaleString('en')}`;

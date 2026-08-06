import mammoth from 'mammoth';

export const MAX_SUPPORTING_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_SUPPORTING_FILES = 5;
export const MAX_EXTRACTED_CHARS_PER_FILE = 20_000;
export const MAX_TOTAL_EXTRACTED_CHARS = 40_000;

const supportedExtensions = ['pdf', 'docx', 'txt'] as const;
type SupportedExtension = (typeof supportedExtensions)[number];

export type SupportingFileStatus = 'extracted' | 'incomplete' | 'unreadable';
export type SupportingFileResult = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  processingMethod: 'openai_pdf' | 'local_extraction';
  status: SupportingFileStatus;
  text: string;
  message: string;
  contentMayBeMissing: boolean;
};

export type SupportingFileInput = { id: string; file: File };

function extensionFor(name: string): SupportedExtension | null {
  const extension = name.split('.').pop()?.toLowerCase();
  return supportedExtensions.includes(extension as SupportedExtension) ? extension as SupportedExtension : null;
}

function cleanExtractedText(value: string): string {
  return value.replace(/\0/g, '').replace(/\r\n?/g, '\n').replace(/[\t ]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}

function unreadable({ id, file }: SupportingFileInput, message = 'We couldn\'t find readable text in this file.'): SupportingFileResult {
  return {
    id,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    processingMethod: extensionFor(file.name) === 'pdf' ? 'openai_pdf' : 'local_extraction',
    status: 'unreadable',
    text: '',
    message,
    contentMayBeMissing: true,
  };
}

export function isSupportedSupportingFile(file: Pick<File, 'name' | 'type'>): boolean {
  const extension = extensionFor(file.name);
  if (!extension) return false;
  if (!file.type || file.type === 'application/octet-stream') return true;
  const expectedTypes: Record<SupportedExtension, string[]> = {
    pdf: ['application/pdf'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    txt: ['text/plain'],
  };
  return expectedTypes[extension].includes(file.type);
}

export function isPdfSupportingFile(file: Pick<File, 'name'>): boolean {
  return extensionFor(file.name) === 'pdf';
}

export function validateSupportingFile(input: SupportingFileInput): SupportingFileResult | null {
  if (!isSupportedSupportingFile(input.file)) return unreadable(input, 'This file type isn\'t supported. Use PDF, DOCX, or TXT.');
  if (input.file.size > MAX_SUPPORTING_FILE_SIZE) return unreadable(input, 'This file exceeds the 10 MB limit.');
  return null;
}

async function extractOne(input: SupportingFileInput): Promise<SupportingFileResult> {
  const { id, file } = input;
  const validationError = validateSupportingFile(input);
  if (validationError) return validationError;
  if (isPdfSupportingFile(file)) return unreadable(input, 'This PDF must be read through the OpenAI file-input workflow.');

  const extension = extensionFor(file.name);
  try {
    let rawText = '';
    let mayOmitStructuredContent = false;
    if (extension === 'txt') {
      rawText = await file.text();
    } else {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (extension === 'docx') rawText = (await mammoth.extractRawText({ buffer })).value;
      mayOmitStructuredContent = true;
    }

    const text = cleanExtractedText(rawText);
    if (!text) return unreadable(input);
    const truncated = text.length > MAX_EXTRACTED_CHARS_PER_FILE;
    return {
      id,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      processingMethod: 'local_extraction',
      status: truncated ? 'incomplete' : 'extracted',
      text: text.slice(0, MAX_EXTRACTED_CHARS_PER_FILE),
      message: truncated
        ? 'Text was extracted, but the file was shortened to fit the planning limit.'
        : mayOmitStructuredContent
          ? 'Text extracted. Tables, charts, images, and layout may not be included.'
          : 'Text extracted.',
      contentMayBeMissing: truncated || mayOmitStructuredContent,
    };
  } catch {
    return unreadable(input, 'We couldn\'t read this file.');
  }
}

export async function extractSupportingFiles(inputs: SupportingFileInput[]): Promise<SupportingFileResult[]> {
  const limited = inputs.slice(0, MAX_SUPPORTING_FILES);
  const results = await Promise.all(limited.map(extractOne));
  let remaining = MAX_TOTAL_EXTRACTED_CHARS;
  return results.map((result) => {
    if (!result.text) return result;
    const text = result.text.slice(0, remaining);
    remaining -= text.length;
    if (text.length === result.text.length) return result;
    return {
      ...result,
      text,
      status: 'incomplete',
      message: text ? 'Some text was omitted because the combined files exceeded the planning limit.' : 'This file was omitted because the combined files exceeded the planning limit.',
      contentMayBeMissing: true,
    };
  });
}

export function publicSupportingFileResults(results: SupportingFileResult[]) {
  return results.map(({ text: _text, processingMethod: _processingMethod, mimeType: _mimeType, size: _size, ...result }) => result);
}

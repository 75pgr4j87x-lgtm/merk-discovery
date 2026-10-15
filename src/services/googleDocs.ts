import { getAccessToken } from './auth';

export interface CreateDocOptions {
  title: string;
  briefText: string;
}

export interface CreatedDocResponse {
  documentId: string;
  docUrl: string;
  title: string;
}

/**
 * Creates a formatted Google Document containing the Website Discovery Project Brief
 */
export async function createGoogleDocBrief(options: CreateDocOptions): Promise<CreatedDocResponse> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google authentication required. Please sign in to save to Google Docs.');
  }

  const safeTitle = options.title.trim() || 'Website Discovery Project Brief';

  // 1. Create the Google Doc
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: safeTitle,
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Failed to create Google Doc (Status ${createRes.status})`
    );
  }

  const docData = await createRes.json();
  const documentId = docData.documentId;

  // 2. Insert the synthesized brief content into the document
  // Google Docs accepts batchUpdate requests. Inserting at index 1 appends to top.
  const insertText = options.briefText.trim() + '\n\n— Generated with DiscoveryFlow Workspace Integration —\n';

  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: insertText,
          },
        },
      ],
    }),
  });

  if (!updateRes.ok) {
    console.warn('Document created but failed to populate batch text:', await updateRes.text());
  }

  return {
    documentId,
    docUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    title: safeTitle,
  };
}

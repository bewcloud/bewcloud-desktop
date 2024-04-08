import type { Directory } from './types.ts';

export async function fetchRemoteDirectories(
  url: string,
  username: string,
  password: string,
): Promise<Directory[]> {
  try {
    const requestHeaders = new Headers();
    requestHeaders.set(
      'Authorization',
      `Basic ${btoa(`${username}:${password}`)}`,
    );
    requestHeaders.set('Content-Type', 'application/json; charset=utf-8');
    const requestBody: { parentPath: string } = { parentPath: '/' };
    const response = await fetch(
      `${url.replace('/dav', '')}/api/files/get-directories`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: requestHeaders,
        mode: 'cors',
      },
    );
    const result = (await response.json()) as {
      success: boolean;
      directories: Directory[];
    };
    if (!result?.success) {
      throw new Error('Unknown error!');
    }

    return result.directories;
  } catch (error) {
    console.error(error);
    alert('Failed to connect! Please check the URL, username, and password.');
  }

  return [];
}

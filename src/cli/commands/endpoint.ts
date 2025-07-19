import { addEndpoint, removeEndpoint, setCurrentEndpoint, listEndpoints, getCurrentEndpoint } from '../../config';

export async function addEndpointCommand(name: string, url: string) {
  addEndpoint(name, url);
}

export async function removeEndpointCommand(name: string) {
  removeEndpoint(name);
}

export async function useEndpointCommand(name: string) {
  setCurrentEndpoint(name);
}

export async function listEndpointsCommand() {
  const endpoints = listEndpoints();
  if (endpoints.length === 0) {
    console.log('登録されているエンドポイントはありません。');
    return;
  }
  console.log('登録されているOllamaエンドポイント:');
  endpoints.forEach(ep => {
    console.log(`  ${ep.name === getCurrentEndpoint().name ? '*' : ' ' } ${ep.name} (${ep.url})`);
  });
}

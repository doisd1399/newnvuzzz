import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nvu.operacional',
  appName: 'nvu',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com"],
    },
  },
  // IMPORTANTE: Para que o Capacitor reconheça como plataforma nativa (Android/iOS)
  // e não como Web, NUNCA utilize a propriedade "server.url" apontando para um IP
  // local em builds de produção ou testes nativos. O app deve carregar os arquivos
  // estáticos da pasta "dist".
  // 
  // server: {
  //   url: 'http://192.168.x.x:3000', // <-- REMOVER ISSO para o Push funcionar
  //   cleartext: true
  // }
};

export default config;

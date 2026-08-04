import app from './app';

const configuredPort = Number(process.env.PORT ?? 5000);
const port = Number.isInteger(configuredPort) && configuredPort > 0
  ? configuredPort
  : 5000;

app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});

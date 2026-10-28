import { app } from './app.js';
import './jobs/workers/email.worker.js';

app.listen(process.env.PORT || 3000, (err) => {
  if (err) {
    console.log(err);
  } else console.log('Listening to the server');
});

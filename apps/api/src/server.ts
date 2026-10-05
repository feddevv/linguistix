import { app } from './app.js';

app.listen(process.env.PORT || 3000, (err) => {
  if (err) {
    console.log(err);
  } else console.log('Listening to the server');
});

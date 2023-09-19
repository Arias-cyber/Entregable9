import dotenv from 'dotenv';
import express, { urlencoded } from 'express';
import products from "./routes/products.router.js"
import carts from "./routes/carts.router.js"
import viewsRouter from "./routes/views.router.js";
import handlebars from "express-handlebars";
import __dirname from "./utils.js";
import {Server} from "socket.io"
import { createServer } from 'http';
import ProductManager from "./dao/filesystem/manager/ProductManager.js";
import mongoose from 'mongoose'
import Message from './dao/mongo/models/message.js';
import Handlebars from 'handlebars';
import { allowInsecurePrototypeAccess } from '@handlebars/allow-prototype-access';
import MongoStore from "connect-mongo";
import session from "express-session";
import sessionsRouter from "./routes/session.router.js";
import passport from "passport";
import initializePassport from "./config/passport.config.js";
import isUser from './middlewares/isUser.js';
import generateProducts from './mooking.js'
import logger from './utils/logger.js';
//defino dotenv y las constantes del .env

dotenv.config({ path: 'src/.env' });
const mongoUrl = process.env.MONGO_URL;
const sessionSecret = process.env.SESSION_SECRET;

// Establece NODE_ENV según el entorno real
if (process.env.NODE_ENV === undefined) {
  process.env.NODE_ENV = 'development'; // Establece un valor predeterminado si no está definido
}

const hbs = handlebars.create({
  handlebars: allowInsecurePrototypeAccess(Handlebars),
  helpers: {
    ifEquals: function (arg1, arg2, options) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    },
  },
});

const app = express();

const connection = await mongoose.connect(mongoUrl)
const httpServer = createServer(app);
const io = new Server(httpServer);
const productManager = new ProductManager();

app.use(
  session({
    store: new MongoStore({
      mongoUrl,
      ttl: 3600,
    }),
    secret:sessionSecret,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.json());
app.use(urlencoded({ extended: true }))
app.use('/api/products',products);
app.use('/api/carts',carts);

app.engine("handlebars", hbs.engine);
app.set("view engine", "handlebars");
app.set("views", __dirname + "/views");
app.use(express.static(__dirname + "/public"));
initializePassport();
app.use(passport.initialize());
app.use(passport.session());
//middleware de errores globales
app.use((err, req, res, next) => {
  if (err.code) {
    // Si es un error generado por el módulo errorHandler.js
    return res.status(400).json({ error: err });
  }
  // Otros errores no controlados
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
app.use("/",viewsRouter)
app.get('/filesystem', (req, res) => {
    const products = productManager.getProducts();
    res.render('home', { products });
  });


  app.get('/chat', isUser, async (req, res) => {
    const messages = await Message.find().lean();
    res.render('chat', { messages });
  });

io.on('connection', (socket) => {
  console.log('Un cliente se ha conectado');

  socket.on('message', async (data) => {
    const { user, message } = data;

  if (!user || user.trim() === '') {
    console.log('Error: el campo "user" es requerido');
    return;
  }

    // Guardar el mensaje en la colección "messages" en MongoDB
    const newMessage = new Message({ user, message });
    await newMessage.save();

    // Emitir el evento "messageLogs" a todos los clientes conectados
    const messages = await Message.find().lean();
    io.emit('messageLogs', messages);
  });

  });

const port = process.env.PORT || 8080;

  httpServer.listen(8080, () => {
    console.log(`Server is running on port ${port}` );
  });
  
app.use("/api/sessions", sessionsRouter);
app.use('/mockingproducts', generateProducts);

app.get('/loggerTest', (req, res) => {
  logger.debug('Mensaje de depuración');
  logger.http('Mensaje HTTP');
  logger.info('Mensaje de información');
  logger.warning('Mensaje de advertencia');
  logger.error('Mensaje de error');
  logger.fatal('Mensaje fatal');

  res.json({ message: 'Mensajes de prueba registrados en el log.' });
});


export {io};


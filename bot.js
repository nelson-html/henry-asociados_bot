require('dotenv').config();
const { Telegraf, Markup, Scenes, session } = require('telegraf');
// esto es solo un comentario zxs
/* ============================
   Config y helpers
============================ */
const BOT_NAME = 'Henry & Asociados';
const CONTACTO = {
  direccion: 'León, Nicaragua. Barrio Posada del Sol, Casa #24',
  horario: 'Lun a Vie, 9:00 a.m. - 6:00 p.m.',
  email: 'tinocomathew845@gmail.com',
  tel: '+505 5803 3696',
  mapsUrl: 'https://maps.google.com/?q=12.443111,-86.865667'
};

const citas = new Map();

const SERVICIOS = [
  'Asesoría jurídica general',
  'Derecho civil',
  'Derecho penal',
  'Derecho laboral',
  'Derecho mercantil',
  'Redacción de contrato'
];

const CONTACTO_PREFS = ['Correo', 'Teléfono'];

// ============================
// Helpers de validación
// ============================
function isValidISODate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '');
}
function isValidTimeHM(timeStr) {
  return /^\d{2}:\d{2}$/.test(timeStr || '');
}
function isFutureSlot(dateStr, timeStr) {
  const [Y,M,D] = dateStr.split('-').map(Number);
  const [h,m] = timeStr.split(':').map(Number);
  const slot = new Date(Y, M-1, D, h, m, 0, 0);
  slot.setSeconds(0,0);
  return slot.getTime() > Date.now();
}

/* ============================
   Escena: Agendar cita
============================ */
const agendaWizard = new Scenes.WizardScene(
  'AGENDA_WIZARD',
  async (ctx) => {
    ctx.wizard.state.cita = { chatId: ctx.chat.id };
    await ctx.reply(`Perfecto. Para agendar una cita, necesito algunos datos.\n¿Cuál es tu nombre completo?`);
    return ctx.wizard.next();
  },
  async (ctx) => {
    const name = ctx.message?.text?.trim();
    if (!name) return ctx.reply('Por favor, escribe tu nombre.');
    ctx.wizard.state.cita.name = name;

    await ctx.reply(
      '¿Qué tipo de servicio necesitas?',
      Markup.inlineKeyboard(
        SERVICIOS.map((s) => Markup.button.callback(s, `svc:${s}`)),
        { columns: 2 }
      )
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery?.data?.startsWith('svc:')) {
      const svc = ctx.callbackQuery.data.slice(4);
      ctx.wizard.state.cita.service = svc;
      await ctx.answerCbQuery();
      await ctx.reply('Indica la fecha deseada (formato YYYY-MM-DD):');
      return ctx.wizard.next();
    }
    return ctx.reply('Selecciona un servicio del listado.');
  },
  // Paso FECHA (índice 3)
  async (ctx) => {
    const date = ctx.message?.text?.trim();

    if (!isValidISODate(date)) {
      return ctx.reply('Formato inválido. Usa YYYY-MM-DD (ej. 2025-10-30).');
    }

    // Validar que la fecha no sea pasada (end of day)
    const [Y,M,D] = date.split('-').map(Number);
    const endOfDay = new Date(Y, M-1, D, 23, 59, 59, 999);
    if (endOfDay.getTime() < Date.now()) {
      return ctx.reply('La fecha debe ser hoy o futura. Ingresa otra fecha (YYYY-MM-DD).');
    }

    ctx.wizard.state.cita.date = date;
    await ctx.reply('¿Qué hora prefieres? Usa 24h HH:mm (ej. 15:30):');
    return ctx.wizard.next();
  },
  // Paso HORA (índice 4)
  async (ctx) => {
    const time = ctx.message?.text?.trim();
    if (!isValidTimeHM(time)) {
      return ctx.reply('Formato inválido. Usa HH:mm (24h).');
    }

    const date = ctx.wizard.state.cita.date;

    // Si fecha+hora queda en pasado, volver al paso de FECHA
    if (!isFutureSlot(date, time)) {
      delete ctx.wizard.state.cita.time;
      await ctx.reply('La combinación fecha/hora quedó en el pasado. Ingresa una nueva fecha (YYYY-MM-DD):');
      ctx.wizard.selectStep(3); // volver a FECHA
      return;
    }

    ctx.wizard.state.cita.time = time;

    await ctx.reply(
      '¿Deseas que te contactemos por correo o teléfono?',
      Markup.inlineKeyboard(
        CONTACTO_PREFS.map((p) => Markup.button.callback(p, `pref:${p}`)),
        { columns: 2 }
      )
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery?.data?.startsWith('pref:')) {
      const pref = ctx.callbackQuery.data.slice(5);
      ctx.wizard.state.cita.pref = pref;
      await ctx.answerCbQuery();

      await ctx.reply('¿Algún comentario adicional? Si no, escribe "no".');
      return ctx.wizard.next();
    }
    return ctx.reply('Elige una opción: Correo o Teléfono.');
  },
  async (ctx) => {
    const comments = ctx.message?.text?.trim();
    ctx.wizard.state.cita.comments = comments?.toLowerCase() === 'no' ? '' : (comments || '');

    const c = ctx.wizard.state.cita;
    citas.set(ctx.chat.id, c);

    await ctx.reply(
      `¡Gracias! Tu cita ha sido registrada.\n\n` +
      `Nombre: ${c.name}\n` +
      `Servicio: ${c.service}\n` +
      `Fecha: ${c.date}\n` +
      `Hora: ${c.time}\n` +
      `Preferencia de contacto: ${c.pref}\n` +
      `Comentarios: ${c.comments || '—'}\n\n` +
      `Recibirás una confirmación por correo/WhatsApp.`
    );

    // fetch('https://tu-dominio.vercel.app/api/agenda', { ... })

    return ctx.scene.leave();
  }
);

/* ============================
   Stage y sesión
============================ */
const stage = new Scenes.Stage([agendaWizard]);

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use(stage.middleware());

/* ============================
   Menú principal
============================ */
const mainMenu = () =>
  Markup.inlineKeyboard(
    [
      [Markup.button.callback('Agendar una cita 📅', 'm:agenda')],
      [Markup.button.callback('Consultar servicios ⚖️', 'm:servicios')],
      [Markup.button.callback('Ubicación y contacto 📍', 'm:contacto')],
      [Markup.button.callback('Hablar con un asesor 🧑‍💼', 'm:asesor')],
      [Markup.button.callback('Otro tema ❓', 'm:otro')],
      [Markup.button.callback('Ver video institucional 🎥', 'm:video')],
      [Markup.button.callback('Solicitar servicio 📨', 'm:form')],
    ],
    { columns: 1 }
  );

bot.start(async (ctx) => {
  await ctx.reply(
    `¡Hola! 👋 Bienvenido al Bufete Jurídico ${BOT_NAME}. ¿En qué puedo ayudarte hoy?`,
    mainMenu()
  );
});

bot.on('text', ctx =>{
    ctx.reply("Para empezar, usa '/start', para consultar al bot.")
})

bot.action('m:inicio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`¿En qué puedo ayudarte hoy?`, mainMenu());
});

bot.action('m:agenda', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.scene.enter('AGENDA_WIZARD');
});

bot.action('m:servicios', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Ofrecemos los siguientes servicios legales:\n' +
      SERVICIOS.map((s) => `• ${s}`).join('\n') +
      '\n\n¿Deseas más información sobre alguno?',
    Markup.inlineKeyboard(
      [
        ...SERVICIOS.map((s) => Markup.button.callback(s, `info:${s}`)),
        Markup.button.callback('⬅️ Volver', 'm:inicio')
      ],
      { columns: 2 }
    )
  );
});

bot.action(/^info:/, async (ctx) => {
  const svc = ctx.callbackQuery.data.slice(5);
  await ctx.answerCbQuery();
  await ctx.reply(
    `Información sobre ${svc}:\n` +
    `Ofrecemos asesoría especializada, revisión de documentos y representación legal según aplique.`
  );
});

bot.action('m:contacto', async (ctx) => {
  await ctx.answerCbQuery();
  const msg =
    `📍 ${CONTACTO.direccion}\n` +
    `🕒 ${CONTACTO.horario}\n` +
    `📧 ${CONTACTO.email}\n` +
    `📞 ${CONTACTO.tel}\n\n` +
    `Mapa: ${CONTACTO.mapsUrl}`;
  await ctx.editMessageText(
    msg,
    Markup.inlineKeyboard([
      Markup.button.url('Abrir Google Maps', CONTACTO.mapsUrl),
      Markup.button.callback('⬅️ Volver', 'm:inicio')
    ])
  );
});

bot.action('m:asesor', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Un momento por favor... Estoy conectándote con uno de nuestros asesores.',
    Markup.inlineKeyboard([
      Markup.button.url('WhatsApp', 'https://wa.me/50558033696'),
      Markup.button.callback('⬅️ Volver', 'm:inicio')
    ])
  );
});

bot.action('m:otro', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Por favor, escribe tu consulta y haré lo posible por ayudarte o redirigirte al área correspondiente.',
    Markup.inlineKeyboard([Markup.button.callback('⬅️ Volver', 'm:inicio')])
  );
});

bot.on('text', async (ctx, next) => {
  if (ctx.update.message?.reply_to_message?.text?.includes('escribe tu consulta')) {
    // notificar/guardar si lo deseas
  }
  return next();
});

bot.action('m:video', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithVideo('https://drive.google.com/file/d/1mBnoDVJg37wKb9eeXlJi1dCkCHOcvSU6/view?usp=sharing').catch(async () => {
    await ctx.reply('Aquí tienes nuestro video institucional:', Markup.inlineKeyboard([
      Markup.button.url('Ver en YouTube', 'https://www.youtube.com/watch?v=QXA9ejTCEJc')
    ]));
  });
});

bot.action('m:form', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Para solicitar un servicio, por favor completa el siguiente formulario:',
    Markup.inlineKeyboard([
      Markup.button.url('Abrir formulario', 'https://henry-asociados.vercel.app/#agenda'),
      Markup.button.callback('⬅️ Volver', 'm:inicio')
    ])
  );
});

bot.command('menu', async (ctx) => {
  await ctx.reply('Menú principal:', mainMenu());
});

bot.command('mi_cita', async (ctx) => {
  const c = citas.get(ctx.chat.id);
  if (!c) return ctx.reply('No hay una cita registrada.');
  await ctx.reply(
    `Tu cita:\n` +
    `Nombre: ${c.name}\nServicio: ${c.service}\nFecha: ${c.date}\nHora: ${c.time}\nPref.: ${c.pref}\nComentarios: ${c.comments || '—'}`
  );
});

bot.launch().then(() => {
  console.log(`Bot ${BOT_NAME} iniciado.`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

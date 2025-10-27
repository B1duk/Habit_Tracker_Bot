const { Telegraf } = require("telegraf");
const { createClient } = require('@supabase/supabase-js');
require("dotenv").config();
const { BOT_TOKEN } = process.env;
const bot = new Telegraf(BOT_TOKEN);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY // или SERVICE_ROLE_KEY (осторожно!)
);

const userStates={};
const userHabits = {};

bot.start((ctx) =>{
    const userId = ctx.from.id.toString();
     console.log(`[🚀] Пользователь  (ID: ${userId}) запустил бота.`);
  ctx.reply(
    "Привет! Я ваш Telegram-бот для отслеживания ваших личных привычек. Напиши мне /start и мы вместе начнем отслеживать любые ваши привычки или дела",
    {
      reply_markup: {
        keyboard: [
          [
            "Добавить привычку","Список привычек"
            
          ],
        ],
      },
    }
  )}
);
bot.help((ctx) =>
  ctx.reply("Я реагирую на команды /start и /help, а также на любые сообщения.")
);

bot.hears('Добавить привычку', ctx=>{
    userStates[ctx.from.id]='waiting_for_habit_name';
    ctx.reply('Напишите название привычки');
    
})



bot.hears('Список привычек', async (ctx) => {
  const userId = ctx.from.id.toString();
  console.log("🔍 Запрашиваем user_id (строка):", JSON.stringify(userId));

  // ✅ Сначала делаем запрос и сохраняем результат
  const result = await supabase
    .from('habits')
    .select('id, title')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  // ✅ Теперь извлекаем data и error
  const { data, error } = result;
  console.log("📊 Ответ от Supabase:", { data, error });

  if (error) {
    console.error('Ошибка загрузки привычек:', error);
    return ctx.reply('❌ Не удалось загрузить привычки.');
  }

  if (!data || data.length === 0) {
    return ctx.reply('У вас пока нет привычек. Сначала добавьте одну!');
  }

  const inlineKeyboard = data.map(habit => [
    { text: habit.title, callback_data: `view_${habit.id}` },
    { text: "✅ Отметить", callback_data: `mark_${habit.id}` }
  ]);

  await ctx.reply('Выберите привычку, которую хотите отметить на сегодня:', {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
});



bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString(); 
  const text = ctx.message.text;

  if (text === "Добавить привычку" || text === "Список привычек") return;

  if (userStates[userId] === "waiting_for_habit_name") {
    delete userStates[userId];

    const { data, error } = await supabase
      .from('habits')
      .insert({ user_id: userId, title: text });

    if (error) {
      console.error('Ошибка сохранения:', error);
      ctx.reply('❌ Не удалось сохранить привычку.');
    } else {
      console.log(`[+] Привычка "${text}" от ${userId} сохранена в БД`);
      ctx.reply(`✅ Привычка "${text}" добавлена!`);
    }
    return;
  }
});




function getToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];
}

bot.action(/mark_(.+)/, async (ctx) => {
  const habitId = ctx.match[1];
  const userId = ctx.from.id.toString();
  const today = getToday();
  console.log("📅 Сегодняшняя дата (по серверу):", today);

  // Получаем привычку
  const { data: habitData, error: habitError } = await supabase
    .from('habits')
    .select('title')
    .eq('id', habitId)
    .eq('user_id', userId)
    .single();

  if (habitError || !habitData) {
    console.error("❌ Привычка не найдена для user_id:", userId, "и habitId:", habitId);
    return ctx.answerCbQuery('❌ Привычка не найдена.');
  }

  const habit = habitData;

  // Проверяем, отмечена ли уже сегодня
  const { data: existingRecord, error: existingError } = await supabase
    .from('habit_records')
    .select('id')
    .eq('habit_id', habitId)
    .eq('record_date', today)
    .maybeSingle();

  console.log("🔍 Результат проверки отметки:", { existingRecord, existingError });

  if (existingRecord) {
    return ctx.answerCbQuery('✅ Уже отмечено сегодня!');
  }

  // Отмечаем
  const { error: insertError } = await supabase
    .from('habit_records')
    .insert({
      habit_id: habitId,
      user_id: userId,
      record_date: today,
    });

  if (insertError) {
    console.error('Ошибка отметки:', insertError);
    return ctx.answerCbQuery('❌ Не удалось сохранить.');
  }

  console.log(`[✓] ${userId} отметил "${habit.title}" на ${today}`);
  return ctx.answerCbQuery(`✅ "${habit.title}" отмечено!`);
});

bot.launch();

console.log("Бот запущен!");





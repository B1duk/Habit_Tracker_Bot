const { Telegraf } = require("telegraf");
const { createClient } = require('@supabase/supabase-js');
require("dotenv").config();
const { BOT_TOKEN } = process.env;
const bot = new Telegraf(BOT_TOKEN);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY 
);

const userStates={};
const userHabits = {};
async function sendHabitsList(ctx) {
  const userId = ctx.from.id.toString();

  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, title')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (habitsError || !habits?.length) {
    return ctx.reply('У вас пока нет привычек.');
  }

  const habitIds = habits.map(h => h.id);
  const { data: records, error: recordsError } = await supabase
    .from('habit_records') 
    .select('habit_id, record_date')
    .in('habit_id', habitIds);

  if (recordsError) {
    console.error('Ошибка загрузки записей:', recordsError);
    return ctx.reply('❌ Не удалось загрузить данные.');
  }


  const recordsByHabit = {};
  records.forEach(r => {
    if (!recordsByHabit[r.habit_id]) recordsByHabit[r.habit_id] = [];
    recordsByHabit[r.habit_id].push(r.record_date);
  });

  const inlineKeyboard = habits.map(habit => {
    const dates = recordsByHabit[habit.id] || [];
    const streak = calculateStreak(dates);
    const streakText = streak > 0 ? ` 🔥${streak}` : '';

    return [
      { text: `${habit.title}${streakText}`, callback_data: `view_${habit.id}` },
      { text: "✅ Отметить", callback_data: `mark_${habit.id}` }
    ];
  });

  await ctx.reply('Ваши привычки:', {
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
}
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



function calculateStreak(recordDates) {
  if (!recordDates || recordDates.length === 0) return 0;

  const today = getToday();
  const dateSet = new Set(recordDates);

  let current = today;
  let streak = 0;

  while (dateSet.has(current)) {
    streak++;
    const d = new Date(current);
    d.setDate(d.getDate() - 1);
    current = d.toISOString().split('T')[0];
  }

  return streak;
}

  bot.hears('Список привычек', async (ctx) => {
  await sendHabitsList(ctx);
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
  const { data: existingRecord } = await supabase
    .from('habit_records')
    .select('id')
    .eq('habit_id', habitId)
    .eq('record_date', today)
    .maybeSingle();

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
  
  await ctx.deleteMessage();
  await sendHabitsList(ctx);
});

bot.launch();

console.log("Бот запущен!");





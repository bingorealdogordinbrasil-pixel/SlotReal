const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741";
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
const SENHA_ADMIN = "76811867";

mongoose.connect(MONGO_URI).then(() => console.log("💎 SLOTREAL CONECTADO"));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    email: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    saldoGanhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0] }
}));

const Stats = mongoose.models.Stats || mongoose.model('Stats', new mongoose.Schema({ lucroTotal: { type: Number, default: 0 } }));
const Saque = mongoose.models.Saque || mongoose.model('Saque', new mongoose.Schema({ user: String, userID: String, valor: Number, pix: String, status: { type: String, default: "Pendente" }, data: { type: Date, default: Date.now } }));

// TIMER GLOBAL: 30s de aposta + 10s de animação/resultado
let tempo = 30;
let emPausa = false;
setInterval(() => {
    if (!emPausa) {
        if (tempo > 0) tempo--;
        else {
            emPausa = true;
            setTimeout(() => { tempo = 30; emPausa = false; }, 10000); 
        }
    }
}, 1000);

app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo, pausa: emPausa }));

app.post('/auth/register', async (req, res) => {
    try {
        const novo = new User({ user: req.body.user, email: req.body.email, pass: req.body.pass });
        const salvo = await novo.save();
        res.json({ success: true, id: salvo._id });
    } catch (e) { res.json({ success: false, msg: "Erro no cadastro!" }); }
});

app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, id: c._id, user: c.user, saldo: c.saldo, bets: c.bets });
    else res.json({ success: false });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(!u) return res.json({ success: false });
    const totalApostado = u.bets.reduce((a, b) => a + b, 0);
    let menor = Math.min(...u.bets);
    let opcoes = [];
    u.bets.forEach((v, i) => { if (v === menor) opcoes.push(i); });
    const alvo = opcoes[Math.floor(Math.random() * opcoes.length)];
    const ganho = Number((u.bets[alvo] * 5).toFixed(2));
    await Stats.findOneAndUpdate({}, { $inc: { lucroTotal: (totalApostado - ganho) } }, { upsert: true });
    const nS = Number((u.saldo + ganho).toFixed(2));
    const nSG = Number((u.saldoGanhos + ganho).toFixed(2));
    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: nS, saldoGanhos: nSG, bets: [0,0,0,0,0,0,0,0] } });
    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, valorGanho: ganho });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/gerar-pix', (req, res) => {
    const valor = Number(req.body.valor);
    if(valor < 5) return res.json({ success: false, msg: "Mínimo R$ 5" });
    const postData = JSON.stringify({
        transaction_amount: valor,
        description: `ID:${req.body.id}`,
        payment_method_id: "pix",
        payer: { email: "c@e.com", first_name: req.body.user }
    });
    const options = {
        hostname: 'api.mercadopago.com',
        path: '/v1/payments',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': Date.now().toString() }
    };
    const mpReq = https.request(options, (mpRes) => {
        let b = ''; mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try {
                const r = JSON.parse(b);
                res.json({ success: true, qr: r.point_of_interaction.transaction_data.qr_code_base64, code: r.point_of_interaction.transaction_data.qr_code });
            } catch (e) { res.json({ success: false }); }
        });
    });
    mpReq.write(postData); mpReq.end();
});

app.post('/api/saque', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if (u && parseFloat(req.body.valor) >= 20 && u.saldoGanhos >= parseFloat(req.body.valor)) {
        const v = parseFloat(req.body.valor);
        await User.findOneAndUpdate({ user: u.user }, { $inc: { saldo: -v, saldoGanhos: -v } });
        await new Saque({ user: u.user, userID: u._id, valor: v, pix: req.body.pix }).save();
        res.json({ success: true });
    } else res.json({ success: false, msg: "Erro no saque (Mín. 20)" });
});

app.listen(process.env.PORT || 10000);

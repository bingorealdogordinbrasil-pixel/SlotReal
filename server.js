const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONFIGURAÇÕES
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741";
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
const SENHA_ADMIN = "76811867";

mongoose.connect(MONGO_URI).then(() => console.log("💎 SLOTREAL CONECTADO - USUÁRIOS COM ID E EMAIL"));

// BANCO DE DADOS
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    saldo: { type: Number, default: 0.00 },
    saldoGanhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0] }
}));

// Restante dos modelos (Stats, Saque) permanecem iguais...
const Stats = mongoose.models.Stats || mongoose.model('Stats', new mongoose.Schema({ lucroTotal: { type: Number, default: 0 } }));
const Saque = mongoose.models.Saque || mongoose.model('Saque', new mongoose.Schema({ user: String, userID: String, valor: Number, pix: String, status: { type: String, default: "Pendente" }, data: { type: Date, default: Date.now } }));

// TIMER CENTRALIZADO (Sincronizado)
let tempo = 30;
let emPausa = false;
setInterval(() => {
    if (!emPausa) {
        if (tempo > 0) tempo--;
        else {
            emPausa = true;
            setTimeout(() => { tempo = 30; emPausa = false; }, 11000); 
        }
    }
}, 1000);

app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo, pausa: emPausa }));

// REGISTRO COM E-MAIL E ID
app.post('/auth/register', async (req, res) => {
    try {
        const { user, email, pass } = req.body;
        if (!user || !email || !pass) return res.json({ success: false, msg: "Preencha todos os campos!" });
        
        const novo = new User({ user, email, pass });
        const salvo = await novo.save();
        res.json({ success: true, id: salvo._id });
    } catch (e) { 
        res.json({ success: false, msg: "Usuário ou E-mail já existem!" }); 
    }
});

// LOGIN RETORNANDO O ID
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, id: c._id, user: c.user, saldo: c.saldo, bets: c.bets });
    else res.json({ success: false, msg: "Dados incorretos!" });
});

// GIRO (MULTIPLICADOR 5X)
app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(!u) return res.json({ success: false });

    const totalApostado = u.bets.reduce((a, b) => a + b, 0);
    let menor = Math.min(...u.bets);
    let opcoes = [];
    u.bets.forEach((v, i) => { if (v === menor) opcoes.push(i); });
    const alvo = opcoes[Math.floor(Math.random() * opcoes.length)];
    
    const ganho = Number((u.bets[alvo] * 5).toFixed(2));
    const lucroRodada = totalApostado - ganho;
    await Stats.findOneAndUpdate({}, { $inc: { lucroTotal: lucroRodada } }, { upsert: true });
    
    const nS = Number((u.saldo + ganho).toFixed(2));
    const nSG = Number((u.saldoGanhos + ganho).toFixed(2));
    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: nS, saldoGanhos: nSG, bets: [0,0,0,0,0,0,0,0] } });
    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, valorGanho: ganho });
});

// DEPÓSITO MÍNIMO R$ 5
app.post('/gerar-pix', (req, res) => {
    const valorDepo = Number(req.body.valor);
    if(!valorDepo || valorDepo < 5) return res.json({ success: false, msg: "Mínimo R$ 5" });

    const postData = JSON.stringify({
        transaction_amount: valorDepo,
        description: `ID:${req.body.id}_User:${req.body.user}`,
        payment_method_id: "pix",
        payer: { email: req.body.email || "cliente@email.com", first_name: req.body.user }
    });

    const options = {
        hostname: 'api.mercadopago.com',
        path: '/v1/payments',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MP_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': Date.now().toString()
        }
    };

    const mpReq = https.request(options, (mpRes) => {
        let b = '';
        mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try {
                const r = JSON.parse(b);
                if (r.point_of_interaction) res.json({ success: true, qr: r.point_of_interaction.transaction_data.qr_code_base64, code: r.point_of_interaction.transaction_data.qr_code });
                else res.json({ success: false, msg: "Erro no Mercado Pago" });
            } catch (e) { res.json({ success: false }); }
        });
    });
    mpReq.write(postData);
    mpReq.end();
});

// SAQUE MÍNIMO R$ 20 (Salvando com ID)
app.post('/api/saque', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    const valorSaque = parseFloat(req.body.valor);
    if (!u) return res.json({ success: false });
    if (valorSaque < 20) return res.json({ success: false, msg: "Mínimo R$ 20" });
    if (u.saldoGanhos < valorSaque) return res.json({ success: false, msg: "Saldo de ganhos insuficiente!" });

    await User.findOneAndUpdate({ user: u.user }, { $inc: { saldo: -valorSaque, saldoGanhos: -valorSaque } });
    await new Saque({ user: u.user, userID: u._id, valor: valorSaque, pix: req.body.pix }).save();
    res.json({ success: true });
});

app.listen(process.env.PORT || 10000);

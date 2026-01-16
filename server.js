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

mongoose.connect(MONGO_URI).then(() => console.log("💎 SLOTREAL CONECTADO E PIX ATIVO"));

// BANCO DE DADOS
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

const Stats = mongoose.models.Stats || mongoose.model('Stats', new mongoose.Schema({
    lucroTotal: { type: Number, default: 0 }
}));

const Saque = mongoose.models.Saque || mongoose.model('Saque', new mongoose.Schema({
    user: String,
    valor: Number,
    pix: String,
    status: { type: String, default: "Pendente" },
    data: { type: Date, default: Date.now }
}));

// TIMER DO JOGO
let tempo = 30;
setInterval(() => { if(tempo > 0) tempo--; else tempo = 30; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo }));

// SALVAR DADOS
app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

// GERAR PIX
app.post('/gerar-pix', (req, res) => {
    const postData = JSON.stringify({
        transaction_amount: Number(req.body.valor),
        description: `Dep_SlotReal_${req.body.user}`,
        payment_method_id: "pix",
        payer: { email: "gerente_vendas@email.com", first_name: req.body.user }
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
                if (r.point_of_interaction) {
                    res.json({ success: true, qr: r.point_of_interaction.transaction_data.qr_code_base64, code: r.point_of_interaction.transaction_data.qr_code });
                } else { res.json({ success: false }); }
            } catch (e) { res.json({ success: false }); }
        });
    });
    mpReq.write(postData);
    mpReq.end();
});

// SOLICITAR SAQUE
app.post('/api/saque', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    const valor = parseFloat(req.body.valor);
    if (u && u.saldo >= valor && valor >= 10) {
        await User.findOneAndUpdate({ user: u.user }, { $inc: { saldo: -valor } });
        const novo = new Saque({ user: u.user, valor: valor, pix: req.body.pix });
        await novo.save();
        res.json({ success: true });
    } else {
        res.json({ success: false, msg: "Saldo insuficiente ou valor baixo!" });
    }
});

// GIRO CONFIGURADO: CADA R$ 0,50 GANHA R$ 5,00 (Multiplicador 10x)
app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(!u) return res.json({ success: false });

    const totalApostado = u.bets.reduce((a, b) => a + b, 0);
    let menor = Math.min(...u.bets);
    let opcoes = [];
    u.bets.forEach((v, i) => { if (v === menor) opcoes.push(i); });

    const alvo = opcoes[Math.floor(Math.random() * opcoes.length)];
    
    // REGRA: Aposta na cor * 10. (0.50 -> 5.00 | 1.00 -> 10.00)
    const ganho = Number((u.bets[alvo] * 10).toFixed(2));
    const lucroRodada = totalApostado - ganho;

    // Salva o lucro real para você ver no painel admin
    await Stats.findOneAndUpdate({}, { $inc: { lucroTotal: lucroRodada } }, { upsert: true });
    
    const nS = Number((u.saldo + ganho).toFixed(2));
    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: nS, bets: [0,0,0,0,0,0,0,0,0,0] } });

    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, valorGanho: ganho });
});

// ADMIN LIST (USUÁRIOS, LUCRO E SAQUES)
app.post('/api/admin/list', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    const users = await User.find({}, 'user saldo');
    const st = await Stats.findOne({});
    const saques = await Saque.find({ status: "Pendente" });
    res.json({ success: true, users, lucroBanca: st ? st.lucroTotal : 0, saques });
});

// PAGAR SAQUE (LIMPA DA LISTA)
app.post('/api/admin/pagar-saque', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    await Saque.findByIdAndDelete(req.body.id);
    res.json({ success: true });
});

app.post('/api/admin/bonus', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    await User.findOneAndUpdate({ user: req.body.user }, { $inc: { saldo: req.body.valor } });
    res.json({ success: true });
});

app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo, bets: c.bets });
    else res.json({ success: false });
});

app.post('/auth/register', async (req, res) => {
    try {
        const novo = new User({ user: req.body.user, pass: req.body.pass });
        await novo.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.listen(process.env.PORT || 10000);
            

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

mongoose.connect(MONGO_URI).then(() => console.log("💎 SLOTREAL CONECTADO - SISTEMA SINCRONIZADO"));

// BANCO DE DADOS (Com E-mail e Saldo de Ganhos)
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    email: String,
    pass: String,
    saldo: { type: Number, default: 0.00 },
    saldoGanhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0] }
}));

const Stats = mongoose.models.Stats || mongoose.model('Stats', new mongoose.Schema({ lucroTotal: { type: Number, default: 0 } }));
const Saque = mongoose.models.Saque || mongoose.model('Saque', new mongoose.Schema({ user: String, valor: Number, pix: String, status: { type: String, default: "Pendente" }, data: { type: Date, default: Date.now } }));

// TIMER CENTRALIZADO (Pausa de 11 segundos para giro + prêmio)
let tempo = 30;
let emPausa = false;

setInterval(() => {
    if (!emPausa) {
        if (tempo > 0) {
            tempo--;
        } else {
            emPausa = true;
            setTimeout(() => {
                tempo = 30;
                emPausa = false;
            }, 11000); 
        }
    }
}, 1000);

app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo, pausa: emPausa }));

// SALVAR DADOS
app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

// GERAR PIX (Mínimo R$ 5)
app.post('/gerar-pix', (req, res) => {
    const valorDepo = Number(req.body.valor);
    if(!valorDepo || valorDepo < 5) return res.json({ success: false, msg: "O valor mínimo é R$ 5" });

    const postData = JSON.stringify({
        transaction_amount: valorDepo,
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
                } else { res.json({ success: false, msg: "Erro no PIX" }); }
            } catch (e) { res.json({ success: false, msg: "Erro no servidor" }); }
        });
    });
    mpReq.write(postData);
    mpReq.end();
});

// SAQUE (Mínimo R$ 20 e apenas de Ganhos)
app.post('/api/saque', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    const valorSaque = parseFloat(req.body.valor);
    if (!u) return res.json({ success: false, msg: "Usuário não encontrado" });
    if (valorSaque < 20) return res.json({ success: false, msg: "O saque mínimo é R$ 20,00" });
    if (u.saldoGanhos < valorSaque) return res.json({ success: false, msg: "Saldo de ganhos insuficiente!" });

    const nS = Number((u.saldo - valorSaque).toFixed(2));
    const nSG = Number((u.saldoGanhos - valorSaque).toFixed(2));
    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: nS, saldoGanhos: nSG } });
    await new Saque({ user: u.user, valor: valorSaque, pix: req.body.pix }).save();
    res.json({ success: true });
});

// GIRO (Multiplicador 5x e Casa sempre ganha no menor)
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

// AUTH
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo, bets: c.bets });
    else res.json({ success: false });
});

app.post('/auth/register', async (req, res) => {
    try {
        const novo = new User({ user: req.body.user, email: req.body.email, pass: req.body.pass });
        await novo.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// ADMIN (Pagar Saque e Bônus)
app.post('/api/admin/list', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    const users = await User.find({}, 'user saldo saldoGanhos');
    const st = await Stats.findOne({});
    const saques = await Saque.find({ status: "Pendente" });
    res.json({ success: true, users, lucroBanca: st ? st.lucroTotal : 0, saques });
});

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

app.listen(process.env.PORT || 10000);
                                  

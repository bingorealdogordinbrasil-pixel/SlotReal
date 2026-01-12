const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXÃO MONGODB
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

// MODELOS
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 1.00 }
}));

// MOTOR DO JOGO NO SERVIDOR (AQUI ESTÁ O SEGREDO)
app.post('/api/spin', async (req, res) => {
    try {
        const { user, bets } = req.body;
        
        // 1. Decisão do Resultado (90% Casa / 10% Sorte)
        let corAlvo = 0;
        let sorteioChance = Math.floor(Math.random() * 100);

        if (sorteioChance < 10) {
            // Modo Sorte: Escolhe uma cor que teve aposta
            let comAposta = bets.map((v, i) => v > 0 ? i : -1).filter(v => v !== -1);
            corAlvo = comAposta.length > 0 ? comAposta[Math.floor(Math.random() * comAposta.length)] : Math.floor(Math.random() * 10);
        } else {
            // Modo Casa Ganha: A cor com MENOS dinheiro apostado
            let menorValor = Infinity;
            let vazias = [];
            bets.forEach((valor, i) => {
                if (valor === 0) vazias.push(i);
                if (valor < menorValor) { menorValor = valor; corAlvo = i; }
            });
            if (vazias.length > 0) corAlvo = vazias[Math.floor(Math.random() * vazias.length)];
        }

        // 2. Calcular prêmio e atualizar saldo no banco
        const premio = bets[corAlvo] * 5.0; // Paga 5x
        const userDb = await User.findOne({ user });
        
        // O servidor calcula o novo saldo final para evitar que o usuário altere no navegador
        let novoSaldo = (userDb.saldo + premio); 
        await User.findOneAndUpdate({ user }, { saldo: novoSaldo });

        // Retorna apenas a cor e o novo saldo oficial
        res.json({ success: true, corAlvo, novoSaldo });

    } catch (e) { res.status(500).json({ success: false }); }
});

// --- RESTANTE DAS ROTAS (LOGIN, PIX, WEBHOOK) ---
// (Mantenha as rotas de Login, Depósito e Webhook que enviamos anteriormente aqui embaixo)
app.post('/auth/login', async (req, res) => {
    const { user, pass } = req.body;
    const conta = await User.findOne({ user, pass });
    if (conta) res.json({ success: true, saldo: conta.saldo });
    else res.json({ success: false, message: "Dados incorretos!" });
});

app.post('/auth/cadastro', async (req, res) => {
    try {
        const novo = new User(req.body);
        await novo.save();
        res.json({ success: true, saldo: 1.00 });
    } catch (e) { res.json({ success: false, message: "Erro no cadastro" }); }
});

const client = new MercadoPagoConfig({ accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' });
const payment = new Payment(client);

app.post('/gerar-pix', async (req, res) => {
    try {
        const { userLogado, valor } = req.body;
        const result = await payment.create({ body: {
            transaction_amount: parseFloat(valor),
            description: 'Depósito Slot',
            payment_method_id: 'pix',
            external_reference: userLogado,
            payer: { email: 'pix@slot.com' }
        }});
        res.json({ copia_e_cola: result.point_of_interaction.transaction_data.qr_code, imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64 });
    } catch (e) { res.json(e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
